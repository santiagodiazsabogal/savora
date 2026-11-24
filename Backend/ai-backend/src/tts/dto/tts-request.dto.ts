import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class TtsRequestDto {
  @IsString({ message: 'El texto debe ser una cadena' })
  @IsNotEmpty({ message: 'El texto es requerido' })
  @MaxLength(500, { message: 'El texto no puede superar los 500 caracteres' })
  text!: string;
}