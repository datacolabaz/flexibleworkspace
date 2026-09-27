import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { SiteSettingsService } from './site-settings.service';

@ApiTags('Site settings')
@Controller('site-settings')
export class SiteSettingsPublicController {
  constructor(private readonly siteSettingsService: SiteSettingsService) {}

  @Public()
  @Get('public')
  @ApiOperation({
    summary: 'Public site settings used by the footer (social URLs)',
  })
  getPublic() {
    return this.siteSettingsService.getPublicSocials();
  }
}
