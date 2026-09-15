import { Schema, SchemaFactory } from '@nestjs/mongoose';
import { ContactablePartyBase } from '../../common/schemas/contactable-party.base';

// name/contact/phone/address/remark 这几个字段定义在 ContactablePartyBase 里
// （玩具厂 Factory 也是同一份），这里只留 collection 名这个 OemFactory 自己的东西
@Schema({ timestamps: true, collection: 'oemFactories' })
export class OemFactory extends ContactablePartyBase {}

export const OemFactorySchema = SchemaFactory.createForClass(OemFactory);
