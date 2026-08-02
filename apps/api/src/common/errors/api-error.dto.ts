import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ApiErrorDetailDto {
  @ApiPropertyOptional({ type: String })
  declare field: string | undefined;

  @ApiProperty({ type: String })
  declare reason: string;
}

class ApiErrorPayloadDto {
  @ApiProperty({ type: String })
  declare code: string;

  @ApiProperty({ type: String })
  declare message: string;

  @ApiProperty({ type: String })
  declare correlation_id: string;

  @ApiProperty({ type: [ApiErrorDetailDto] })
  declare details: ApiErrorDetailDto[];

  @ApiProperty({ type: Boolean })
  declare retryable: boolean;
}

export class ApiErrorEnvelopeDto {
  @ApiProperty({ type: () => ApiErrorPayloadDto })
  declare error: ApiErrorPayloadDto;
}
