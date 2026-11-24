import { IsBoolean, IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  name?: string;

  // Aceptación de Términos + Privacidad: el register la exige === true
  // (enforcement en auth.service, error TERMS_NOT_ACCEPTED) y la estampa en DB.
  @IsOptional()
  @IsBoolean()
  acceptTerms?: boolean;
}
