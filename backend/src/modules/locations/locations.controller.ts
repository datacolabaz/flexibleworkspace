import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { LocationsService } from './locations.service';
import { LocationInputDto } from './dto/location-input.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { RoleName } from '../../common/constants/roles.enum';
import { currentProviderId } from '../../common/utils/current-provider.util';
import { DomainException } from '../../common/exceptions/domain.exception';
import { HttpStatus } from '@nestjs/common';

@ApiTags('Provider')
@Controller('provider/locations')
@Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  private requireProviderId(user: AuthenticatedUser): string {
    const providerId = currentProviderId(user);
    if (!providerId) {
      throw new DomainException(
        'NOT_A_PROVIDER',
        'You do not have a provider account.',
        HttpStatus.FORBIDDEN,
      );
    }
    return providerId;
  }

  @Get()
  @ApiOperation({ summary: 'List my locations' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.locationsService.listByProvider(this.requireProviderId(user));
  }

  @Post()
  @ApiOperation({ summary: 'Create a location' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LocationInputDto,
  ) {
    return this.locationsService.create(this.requireProviderId(user), dto);
  }

  @Patch(':locationId')
  @ApiOperation({ summary: 'Update a location' })
  async update(
    @Param('locationId') locationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LocationInputDto,
  ) {
    return this.locationsService.update(
      locationId,
      this.requireProviderId(user),
      dto,
    );
  }
}
