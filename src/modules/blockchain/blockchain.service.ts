import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';

// Import contract ABI (you'll need to copy this from your Hardhat build)
import * as EthCareOptimizedABI from './abi/EthCareOptimized.json';

export interface BlockchainConfig {
  provider: ethers.Provider;
  contract: ethers.Contract;
  wallet: ethers.Wallet;
}

@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);
  private provider: ethers.Provider;
  private contract: ethers.Contract;
  private wallet: ethers.Wallet;

  constructor(
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  async onModuleInit() {
    await this.initializeBlockchain();
    await this.setupEventListeners();
  }

  /**
   * Initialize blockchain connection
   */
  private async initializeBlockchain() {
    try {
      // Setup provider
      const rpcUrl = this.configService.get<string>('ETHEREUM_RPC_URL');
      this.provider = new ethers.JsonRpcProvider(rpcUrl);

      // Setup wallet
      const privateKey = this.configService.get<string>('ETHEREUM_PRIVATE_KEY');
      this.wallet = new ethers.Wallet(privateKey, this.provider);

      // Setup contract
      const contractAddress = this.configService.get<string>('CONTRACT_ADDRESS');
      this.contract = new ethers.Contract(
        contractAddress,
        EthCareOptimizedABI,
        this.wallet,
      );

      // Test connection
      const network = await this.provider.getNetwork();
      const blockNumber = await this.provider.getBlockNumber();

      this.logger.log(`✅ Connected to ${network.name} (chainId: ${network.chainId})`);
      this.logger.log(`📦 Current block: ${blockNumber}`);
      this.logger.log(`📄 Contract: ${contractAddress}`);
      this.logger.log(`👛 Backend wallet: ${this.wallet.address}`);
    } catch (error) {
      this.logger.error('❌ Failed to initialize blockchain', error);
      throw error;
    }
  }

  /**
   * Setup event listeners for contract events
   */
  private async setupEventListeners() {
    try {
      // Account events
      this.contract.on(
        'AccountAdded',
        async (account: string, profile: string, timestamp: bigint) => {
          this.logger.log(`📝 AccountAdded: ${account}`);
          await this.auditService.logBlockchainEvent('ACCOUNT_ADDED', {
            account,
            profile,
            timestamp: Number(timestamp),
          });
        },
      );

      this.contract.on(
        'AccountDeactivated',
        async (account: string, timestamp: bigint) => {
          this.logger.log(`🚫 AccountDeactivated: ${account}`);
          await this.auditService.logBlockchainEvent('ACCOUNT_DEACTIVATED', {
            account,
            timestamp: Number(timestamp),
          });
        },
      );

      // Record events
      this.contract.on(
        'RecordAdded',
        async (owner: string, ipfsHash: string, timestamp: bigint) => {
          this.logger.log(`📄 RecordAdded: ${ipfsHash} by ${owner}`);
          await this.auditService.logBlockchainEvent('RECORD_ADDED', {
            owner,
            ipfsHash,
            timestamp: Number(timestamp),
          });
        },
      );

      this.contract.on(
        'RecordDeleted',
        async (owner: string, ipfsHash: string, timestamp: bigint) => {
          this.logger.log(`🗑️ RecordDeleted: ${ipfsHash} by ${owner}`);
          await this.auditService.logBlockchainEvent('RECORD_DELETED', {
            owner,
            ipfsHash,
            timestamp: Number(timestamp),
          });
        },
      );

      // Permission events
      this.contract.on(
        'PermissionChanged',
        async (
          owner: string,
          viewer: string,
          shareType: bigint,
          documentHash: string,
          expiresAt: bigint,
          timestamp: bigint,
        ) => {
          this.logger.log(
            `🔐 PermissionChanged: ${owner} → ${viewer} (type: ${shareType})`,
          );

          await this.auditService.logBlockchainEvent('PERMISSION_CHANGED', {
            owner,
            viewer,
            shareType: Number(shareType),
            documentHash,
            expiresAt: Number(expiresAt),
            timestamp: Number(timestamp),
          });

          // Notify viewer of new permission
          await this.notificationService.sendPermissionNotification(
            viewer,
            owner,
            Number(shareType),
            documentHash,
          );
        },
      );

      // Emergency access events
      this.contract.on(
        'EmergencyAccessGranted',
        async (
          patient: string,
          emergencyProvider: string,
          justification: string,
          timestamp: bigint,
          expiresAt: bigint,
        ) => {
          this.logger.warn(
            `🚨 EmergencyAccessGranted: ${emergencyProvider} → ${patient}`,
          );

          await this.auditService.logBlockchainEvent('EMERGENCY_ACCESS_GRANTED', {
            patient,
            emergencyProvider,
            justification,
            timestamp: Number(timestamp),
            expiresAt: Number(expiresAt),
          });

          // Alert patient and compliance
          await this.notificationService.sendEmergencyAccessAlert(
            patient,
            emergencyProvider,
            justification,
          );
        },
      );

      this.logger.log('👂 Event listeners configured');
    } catch (error) {
      this.logger.error('Failed to setup event listeners', error);
      throw error;
    }
  }

  /**
   * Add account to blockchain
   */
  async addAccount(
    ownerAddress: string,
    profile: string,
  ): Promise<ethers.ContractTransactionReceipt> {
    try {
      this.logger.log(`Adding account: ${ownerAddress}`);

      const tx = await this.contract.addAccount(ownerAddress, profile);
      const receipt = await tx.wait();

      this.logger.log(`✅ Account added. Tx: ${receipt.hash}`);
      return receipt;
    } catch (error) {
      this.logger.error('Failed to add account', error);
      throw error;
    }
  }

  /**
   * Deactivate account
   */
  async deactivateAccount(
    ownerAddress: string,
  ): Promise<ethers.ContractTransactionReceipt> {
    try {
      this.logger.log(`Deactivating account: ${ownerAddress}`);

      const tx = await this.contract.deactivateAccount(ownerAddress);
      const receipt = await tx.wait();

      this.logger.log(`✅ Account deactivated. Tx: ${receipt.hash}`);
      return receipt;
    } catch (error) {
      this.logger.error('Failed to deactivate account', error);
      throw error;
    }
  }

  /**
   * Get account details
   */
  async getAccount(ownerAddress: string) {
    try {
      const account = await this.contract.getAccount(ownerAddress);
      return {
        owner: account[0],
        profile: account[1],
        isEntity: account[2],
        active: account[3],
        createdAt: new Date(Number(account[4]) * 1000),
        lastModified: new Date(Number(account[5]) * 1000),
      };
    } catch (error) {
      this.logger.error('Failed to get account', error);
      throw error;
    }
  }

  /**
   * Add personal record (no password on-chain)
   */
  async addPersonalRecord(
    owner: string,
    ipfsHash: string,
  ): Promise<ethers.ContractTransactionReceipt> {
    try {
      this.logger.log(`Adding record: ${ipfsHash} for ${owner}`);

      const tx = await this.contract.addPersonalRecord(owner, ipfsHash);
      const receipt = await tx.wait();

      this.logger.log(`✅ Record added. Tx: ${receipt.hash}`);
      return receipt;
    } catch (error) {
      this.logger.error('Failed to add record', error);
      throw error;
    }
  }

  /**
   * Delete personal record
   */
  async deletePersonalRecord(
    owner: string,
    ipfsHash: string,
  ): Promise<ethers.ContractTransactionReceipt> {
    try {
      this.logger.log(`Deleting record: ${ipfsHash} for ${owner}`);

      const tx = await this.contract.deletePersonalRecord(owner, ipfsHash);
      const receipt = await tx.wait();

      this.logger.log(`✅ Record deleted. Tx: ${receipt.hash}`);
      return receipt;
    } catch (error) {
      this.logger.error('Failed to delete record', error);
      throw error;
    }
  }

  /**
   * Get personal record
   */
  async getPersonalRecord(owner: string, ipfsHash: string) {
    try {
      const record = await this.contract.getPersonalRecord(owner, ipfsHash);
      return {
        found: record[0],
        inserted: new Date(Number(record[1]) * 1000),
      };
    } catch (error) {
      this.logger.error('Failed to get record', error);
      throw error;
    }
  }

  /**
   * Get personal records with pagination
   */
  async getPersonalRecordsPaginated(
    owner: string,
    offset: number,
    limit: number,
  ) {
    try {
      const result = await this.contract.getPersonalRecordsPaginated(
        owner,
        offset,
        limit,
      );
      return {
        records: result[0],
        total: Number(result[1]),
      };
    } catch (error) {
      this.logger.error('Failed to get paginated records', error);
      throw error;
    }
  }

  /**
   * Update permission (with expiration)
   */
  async updatePermission(
    ownerAddress: string,
    viewer: string,
    shareType: number,
    documentHash: string,
    expiresAt: number,
  ): Promise<ethers.ContractTransactionReceipt> {
    try {
      this.logger.log(
        `Updating permission: ${ownerAddress} → ${viewer} (type: ${shareType})`,
      );

      const tx = await this.contract.updatePermission(
        ownerAddress,
        viewer,
        shareType,
        documentHash,
        expiresAt,
      );
      const receipt = await tx.wait();

      this.logger.log(`✅ Permission updated. Tx: ${receipt.hash}`);
      return receipt;
    } catch (error) {
      this.logger.error('Failed to update permission', error);
      throw error;
    }
  }

  /**
   * Check if viewer can access document
   */
  async canAccess(
    owner: string,
    viewer: string,
    documentHash: string,
  ): Promise<boolean> {
    try {
      return await this.contract.canAccess(owner, viewer, documentHash);
    } catch (error) {
      this.logger.error('Failed to check access', error);
      throw error;
    }
  }

  /**
   * Get current permission
   */
  async getCurrentPermission(owner: string, viewer: string) {
    try {
      const permission = await this.contract.getCurrentPermission(owner, viewer);
      return {
        shareType: Number(permission[0]),
        documentHash: permission[1],
        expiresAt: new Date(Number(permission[2]) * 1000),
        lastUpdated: new Date(Number(permission[3]) * 1000),
      };
    } catch (error) {
      this.logger.error('Failed to get current permission', error);
      throw error;
    }
  }

  /**
   * Get permission history (paginated)
   */
  async getPermissionHistory(
    owner: string,
    viewer: string,
    offset: number,
    limit: number,
  ) {
    try {
      const result = await this.contract.getPermissionHistory(
        owner,
        viewer,
        offset,
        limit,
      );

      return {
        history: result[0].map((h: any) => ({
          shareType: Number(h.shareType),
          documentHash: h.documentHash,
          grantedAt: new Date(Number(h.grantedAt) * 1000),
          expiresAt: new Date(Number(h.expiresAt) * 1000),
          isEntity: h.isEntity,
        })),
        total: Number(result[1]),
      };
    } catch (error) {
      this.logger.error('Failed to get permission history', error);
      throw error;
    }
  }

  /**
   * Grant emergency role
   */
  async grantEmergencyRole(
    account: string,
  ): Promise<ethers.ContractTransactionReceipt> {
    try {
      this.logger.log(`Granting emergency role: ${account}`);

      const tx = await this.contract.grantEmergencyRole(account);
      const receipt = await tx.wait();

      this.logger.log(`✅ Emergency role granted. Tx: ${receipt.hash}`);
      return receipt;
    } catch (error) {
      this.logger.error('Failed to grant emergency role', error);
      throw error;
    }
  }

  /**
   * Grant emergency access
   */
  async grantEmergencyAccess(
    patient: string,
    justification: string,
    emergencyProviderWallet: ethers.Wallet,
  ): Promise<ethers.ContractTransactionReceipt> {
    try {
      this.logger.warn(
        `🚨 Granting emergency access to ${patient}: ${justification}`,
      );

      // Use emergency provider's wallet to call contract
      const contractWithProvider = this.contract.connect(emergencyProviderWallet);
      const tx = await contractWithProvider.grantEmergencyAccess(
        patient,
        justification,
      );
      const receipt = await tx.wait();

      this.logger.log(`✅ Emergency access granted. Tx: ${receipt.hash}`);
      return receipt;
    } catch (error) {
      this.logger.error('Failed to grant emergency access', error);
      throw error;
    }
  }

  /**
   * Check if emergency access is active
   */
  async hasEmergencyAccess(
    patient: string,
    emergencyProvider: string,
  ): Promise<boolean> {
    try {
      return await this.contract.hasEmergencyAccess(patient, emergencyProvider);
    } catch (error) {
      this.logger.error('Failed to check emergency access', error);
      throw error;
    }
  }

  /**
   * Get contract address
   */
  getContractAddress(): string {
    return this.contract.target as string;
  }

  /**
   * Get provider
   */
  getProvider(): ethers.Provider {
    return this.provider;
  }

  /**
   * Get wallet
   */
  getWallet(): ethers.Wallet {
    return this.wallet;
  }
}
