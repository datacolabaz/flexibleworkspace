import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

/** Shared by photo and video presign requests — the client hasn't uploaded anything yet, just wants a signed PUT URL for this filename/type. */
export class PresignMediaDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  originalFilename: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  mimeType: string;
}

/** Body of the "I finished the direct PUT to storage, now record it" call — never carries file bytes. */
export class ConfirmPhotoDto {
  @ApiProperty({ description: 'storageKey returned by the presign call' })
  @IsString()
  storageKey: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @IsPositive()
  width?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @IsPositive()
  height?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCover?: boolean;
}

export class ReorderPhotosDto {
  @ApiProperty({
    type: [String],
    description: 'Every photoId for this room, in the new display order',
  })
  @ArrayNotEmpty()
  @IsString({ each: true })
  photoIds: string[];
}

/** Duration/mimeType are client-reported — verified against plan limits at confirm time; size is re-verified server-side via a HEAD request (`headSize`) rather than trusted from the client. */
export class ConfirmVideoDto {
  @ApiProperty({ description: 'storageKey returned by the presign call' })
  @IsString()
  storageKey: string;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  durationSeconds: number;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  mimeType: string;
}
