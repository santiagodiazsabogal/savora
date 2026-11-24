import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString,
  Length, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class AddMarketItemDto {
  @IsString()
  @Length(1, 60)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  quantity?: string;

  // Nota opcional del usuario (p.ej. preferencia de marca "Oatly").
  @IsOptional()
  @IsString()
  @MaxLength(80)
  note?: string;
}

export class UpdateMarketItemDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  quantity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  note?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  priceCents?: number | null;

  @IsOptional()
  @IsBoolean()
  checked?: boolean;
}

export class GenerateMarketItemDto {
  @IsString()
  @Length(1, 40)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  quantity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  recipeTitle?: string;
}

export class GenerateMarketDto {
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => GenerateMarketItemDto)
  items: GenerateMarketItemDto[];
}
