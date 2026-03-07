import { Module }        from '@nestjs/common';
import { JwtModule }     from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule }  from '../prisma/prisma.module';
import { EmailModule }   from '../email/email.module';
import { AdminController } from './admin.controller';
import { AdminService }    from './admin.service';

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    // JwtModule pour la génération des tokens d'impersonation
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:      config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '1h') },
      }),
    }),
  ],
  controllers: [AdminController],
  providers:   [AdminService],
})
export class AdminModule {}
