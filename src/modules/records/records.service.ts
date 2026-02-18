import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockchainService } from '../blockchain/blockchain.service';
import { EncryptionService } from '../encryption/encryption.service';
import { IpfsService } from '../ipfs/ipfs.service';
import { AuditService } from '../audit/audit.service';
import { Record } from './entities/record.entity';
import { AddRecordDto } from './dto/add-record.dto';
import { GetRecordsDto } from './dto/get-records.dto';

@Injectable()
export class RecordsService {
  private readonly logger = new Logger(RecordsService.name);

  constructor(
    @InjectRepository(Record)
    private recordRepository: Repository<Record>,
    private blockchainService: BlockchainService,
    private encryptionService: EncryptionService,
    private ipfsService: IpfsService,
    private auditService: AuditService,
  ) {}

  /**
   * Add a new medical record
   * Flow: Encrypt → Upload to IPFS → Store on blockchain → Save metadata
   */
  async addRecord(
    patientId: string,
    dto: AddRecordDto,
    file: Express.Multer.File,
    userId: string,
    ipAddress: string,
  ): Promise<Record> {
    this.logger.log(`Adding record for patient: ${patientId}`);

    try {
      // 1. Encrypt the file
      const encryptedBuffer = await this.encryptionService.encryptFile(
        file.buffer,
        patientId,
      );

      // 2. Upload to IPFS
      const ipfsHash = await this.ipfsService.addFile(
        encryptedBuffer,
        file.originalname,
        {
          patientId,
          recordType: dto.recordType,
          uploadedBy: userId,
          uploadedAt: Date.now(),
        },
      );

      this.logger.log(`File uploaded to IPFS: ${ipfsHash}`);

      // 3. Store reference on blockchain (NO password)
      const tx = await this.blockchainService.addPersonalRecord(
        patientId,
        ipfsHash,
      );

      // 4. Save metadata in database
      const record = this.recordRepository.create({
        patientId,
        ipfsHash,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        recordType: dto.recordType,
        description: dto.description,
        uploadedBy: userId,
        transactionHash: tx.hash,
      });

      await this.recordRepository.save(record);

      // 5. Audit log
      await this.auditService.log({
        action: 'RECORD_ADDED',
        userId,
        patientId,
        resourceId: ipfsHash,
        ipAddress,
        metadata: {
          fileName: file.originalname,
          recordType: dto.recordType,
          transactionHash: tx.hash,
        },
      });

      this.logger.log(`✅ Record added successfully: ${ipfsHash}`);
      return record;
    } catch (error) {
      this.logger.error(`Failed to add record: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get record with access control check
   */
  async getRecord(
    patientId: string,
    ipfsHash: string,
    requesterId: string,
    ipAddress: string,
  ): Promise<{ file: Buffer; metadata: Record }> {
    this.logger.log(`Getting record: ${ipfsHash} for requester: ${requesterId}`);

    try {
      // 1. Check permission on blockchain
      const canAccess = await this.blockchainService.canAccess(
        patientId,
        requesterId,
        ipfsHash,
      );

      if (!canAccess) {
        this.logger.warn(
          `Access denied: ${requesterId} cannot access ${ipfsHash}`,
        );

        await this.auditService.log({
          action: 'RECORD_ACCESS_DENIED',
          userId: requesterId,
          patientId,
          resourceId: ipfsHash,
          ipAddress,
          metadata: { reason: 'No permission' },
        });

        throw new ForbiddenException('You do not have permission to access this record');
      }

      // 2. Get metadata from blockchain
      const blockchainRecord = await this.blockchainService.getPersonalRecord(
        patientId,
        ipfsHash,
      );

      if (!blockchainRecord.found) {
        throw new NotFoundException('Record not found on blockchain');
      }

      // 3. Get metadata from database
      const metadata = await this.recordRepository.findOne({
        where: { ipfsHash, patientId },
      });

      if (!metadata) {
        throw new NotFoundException('Record metadata not found');
      }

      // 4. Download from IPFS
      const encryptedFile = await this.ipfsService.getFile(ipfsHash);

      // 5. Decrypt
      const decryptedFile = await this.encryptionService.decryptFile(
        encryptedFile,
        patientId,
      );

      // 6. Audit log (ACCESS GRANTED)
      await this.auditService.log({
        action: 'RECORD_ACCESSED',
        userId: requesterId,
        patientId,
        resourceId: ipfsHash,
        ipAddress,
        metadata: {
          fileName: metadata.fileName,
          recordType: metadata.recordType,
        },
      });

      this.logger.log(`✅ Record retrieved successfully: ${ipfsHash}`);

      return {
        file: decryptedFile,
        metadata,
      };
    } catch (error) {
      this.logger.error(`Failed to get record: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get paginated records for a patient
   */
  async getRecords(
    patientId: string,
    dto: GetRecordsDto,
    requesterId: string,
  ): Promise<{ records: Record[]; total: number; page: number; totalPages: number }> {
    this.logger.log(`Getting records for patient: ${patientId}`);

    try {
      // Check if requester has permission (at least to check patient's records)
      // In production, you might want more granular checks

      const offset = (dto.page - 1) * dto.pageSize;

      // Get from database (contains metadata)
      const [records, total] = await this.recordRepository.findAndCount({
        where: { patientId },
        skip: offset,
        take: dto.pageSize,
        order: { createdAt: 'DESC' },
      });

      return {
        records,
        total,
        page: dto.page,
        totalPages: Math.ceil(total / dto.pageSize),
      };
    } catch (error) {
      this.logger.error(`Failed to get records: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete a record (GDPR compliance)
   */
  async deleteRecord(
    patientId: string,
    ipfsHash: string,
    userId: string,
    ipAddress: string,
  ): Promise<void> {
    this.logger.log(`Deleting record: ${ipfsHash}`);

    try {
      // 1. Check ownership
      if (patientId !== userId) {
        throw new ForbiddenException('You can only delete your own records');
      }

      // 2. Delete from blockchain
      const tx = await this.blockchainService.deletePersonalRecord(
        patientId,
        ipfsHash,
      );

      // 3. Unpin from IPFS (if we're pinning)
      await this.ipfsService.unpinFile(ipfsHash);

      // 4. Delete from database (or mark as deleted)
      await this.recordRepository.update(
        { ipfsHash, patientId },
        { deletedAt: new Date(), deletedBy: userId },
      );

      // 5. Audit log (keep even after deletion)
      await this.auditService.log({
        action: 'RECORD_DELETED',
        userId,
        patientId,
        resourceId: ipfsHash,
        ipAddress,
        metadata: {
          transactionHash: tx.hash,
        },
      });

      this.logger.log(`✅ Record deleted: ${ipfsHash}`);
    } catch (error) {
      this.logger.error(`Failed to delete record: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get record statistics for a patient
   */
  async getRecordStats(patientId: string) {
    const [totalRecords, recordsByType] = await Promise.all([
      this.recordRepository.count({ where: { patientId, deletedAt: null } }),
      this.recordRepository
        .createQueryBuilder('record')
        .select('record.recordType', 'type')
        .addSelect('COUNT(*)', 'count')
        .where('record.patientId = :patientId', { patientId })
        .andWhere('record.deletedAt IS NULL')
        .groupBy('record.recordType')
        .getRawMany(),
    ]);

    return {
      totalRecords,
      recordsByType,
    };
  }
}
