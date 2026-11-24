import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class JoinWaitlistDto {
  @IsEmail()
  email: string;

  // Código de quien lo invitó (?ref= en la URL). Inválido → se ignora, no bloquea.
  @IsOptional()
  @IsString()
  @MaxLength(16)
  referredByCode?: string;
}
