import { Module, Global } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Global()
@Module({
  imports: [AuditModule, NotificationsModule],
  providers: [BlockchainService],
  exports: [BlockchainService],
})
export class BlockchainModule {}
