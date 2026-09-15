import { Schema, SchemaFactory } from '@nestjs/mongoose';
import { ContactablePartyBase } from '../../common/schemas/contactable-party.base';

// name/contact/phone/address/remark 这几个字段定义在 ContactablePartyBase 里
// （代工厂 OemFactory 也是同一份），这里只留 collection 名这个 Factory 自己的东西
@Schema({ timestamps: true, collection: 'factories' })
export class Factory extends ContactablePartyBase {}

export const FactorySchema = SchemaFactory.createForClass(Factory);
