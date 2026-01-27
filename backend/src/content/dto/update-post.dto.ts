import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';
export class UpdatePostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsOptional()
  title?: string;
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  @IsOptional()
  content?: string;
}
