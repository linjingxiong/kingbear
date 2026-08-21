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
import { InboundModule } from './inbound/inbound.module';
import { OcrModule } from './ocr/ocr.module';
import { BillingModule } from './billing/billing.module';
import { DashboardModule } from './dashboard/dashboard.module';

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
    OcrModule,
    InboundModule,
    BillingModule,
    DashboardModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
