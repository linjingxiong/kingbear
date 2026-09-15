import { NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import { ContactablePartyBase } from '../schemas/contactable-party.base';

/**
 * Factory/OemFactory 这种"名称+联系方式"的简单档案，create/findOne/update/remove
 * 四个方法之前是两份一字不差的代码，抽成这个基类复用。子类（FactoryService/
 * OemFactoryService）该有自己的 @Injectable()、自己的构造函数注入 Model，
 * 需要额外逻辑就在子类里追加（不受这个基类限制）。
 *
 * findAll 不放在这个基类里——Factory 的 findAll 要带产品数量/加工金额统计，返回的
 * 是完全不同形状的对象，跟 OemFactory 单纯 find().sort() 的返回类型没法用同一个方法
 * 签名覆盖（TS 的方法重写要求返回类型协变），所以这个各自在子类里自己写一行更省事。
 */
export abstract class ContactablePartyCrudService<T extends ContactablePartyBase> {
  protected abstract readonly notFoundMessage: string;

  constructor(protected readonly model: Model<T>) {}

  create(dto: Partial<T>) {
    return this.model.create(dto);
  }

  async findOne(id: string) {
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException(this.notFoundMessage);
    return doc;
  }

  async update(id: string, dto: Partial<T>) {
    const doc = await this.model.findByIdAndUpdate(id, dto, { new: true });
    if (!doc) throw new NotFoundException(this.notFoundMessage);
    return doc;
  }

  async remove(id: string) {
    const doc = await this.model.findByIdAndDelete(id);
    if (!doc) throw new NotFoundException(this.notFoundMessage);
    return { success: true };
  }
}
