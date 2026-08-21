import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User } from './schemas/user.schema';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 单用户模式：启动时如果 users 集合是空的，用 .env 里配置的账号密码自动建一个。
   * 这样部署方不需要额外跑一个 seed 脚本。
   */
  async onModuleInit() {
    const count = await this.userModel.countDocuments();
    if (count > 0) return;

    const username = this.configService.get<string>('admin.username')!;
    const password = this.configService.get<string>('admin.password')!;
    const passwordHash = await bcrypt.hash(password, 10);
    await this.userModel.create({ username, passwordHash });
    this.logger.warn(
      `未检测到管理员账号，已自动创建 "${username}"（密码见 .env ADMIN_PASSWORD，建议登录后尽快修改）`,
    );
  }

  async login(username: string, password: string) {
    const user = await this.userModel.findOne({ username });
    if (!user) throw new UnauthorizedException('账号或密码错误');

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) throw new UnauthorizedException('账号或密码错误');

    const token = await this.jwtService.signAsync({ sub: user.id, username: user.username });
    return { token, username: user.username };
  }
}
