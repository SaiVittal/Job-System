import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsObject, IsOptional } from 'class-validator';

export class CreateJobDto {
  @ApiProperty()
  @IsString()
  type: string;

  @ApiProperty()
  @IsObject()
  payload: any;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}