import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { idTransformPlugin } from './common/mongoose/id-transform.plugin';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { FactoryModule } from './factory/factory.module';
import { ProductModule } from './product/product.module';
import { ProductGroupModule } from './product-group/product-group.module';
import { InboundModule } from './inbound/inbound.module';
import { OcrModule } from './ocr/ocr.module';
import { BillingModule } from './billing/billing.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AssetModule } from './asset/asset.module';
import { OemFactoryModule } from './oem-factory/oem-factory.module';
import { MaterialIssuanceModule } from './material-issuance/material-issuance.module';
import { OemReceiptModule } from './oem-receipt/oem-receipt.module';
import { OemReconciliationModule } from './oem-reconciliation/oem-reconciliation.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('mongoUri'),
        connectionFactory: (connection) => {
          connection.plugin(idTransformPlugin);
          return connection;
        },
      }),
    }),
    AuthModule,
    FactoryModule,
    ProductModule,
    ProductGroupModule,
    OcrModule,
    InboundModule,
    BillingModule,
    DashboardModule,
    AssetModule,
    OemFactoryModule,
    MaterialIssuanceModule,
    OemReceiptModule,
    OemReconciliationModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
