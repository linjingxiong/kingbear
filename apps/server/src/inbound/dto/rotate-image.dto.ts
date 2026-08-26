import { IsIn } from 'class-validator';

export class RotateImageDto {
  @IsIn(['left', 'right'])
  direction: 'left' | 'right';
}
