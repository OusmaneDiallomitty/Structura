import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class SendReminderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;
}
