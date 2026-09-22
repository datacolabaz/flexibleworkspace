import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { ProvidersService } from './providers.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { VerifyProviderDto } from './dto/verify-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { RoleName, ADMIN_ROLES } from '../../common/constants/roles.enum';
import { AdminPermission } from '../../common/constants/admin-permission.enum';
import {
  ProviderVerificationDocumentType,
  ProviderVerificationStatus,
} from '../../common/constants/provider.enum';
import { currentProviderId } from '../../common/utils/current-provider.util';
import { DomainException } from '../../common/exceptions/domain.exception';

@ApiTags('Provider')
@Controller()
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Post('providers')
  @ApiOperation({
    summary: 'Register as a provider (self-service, starts PENDING)',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProviderDto,
  ) {
    const provider = await this.providersService.create(user.userId, dto);
    return this.withLogoUrl(provider);
  }

  @Post('providers/:id/logo')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      "Set the calling user's provider business logo/cover photo — callable right after registration, in the same session (see ProvidersService.setLogo)",
  })
  @UseInterceptors(FileInterceptor('logo'))
  async uploadLogo(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new DomainException(
        'FILE_REQUIRED',
        'A logo image file is required.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const provider = await this.providersService.setLogo(id, user.userId, file);
    return this.withLogoUrl(provider);
  }

  @Get('providers/me')
  @Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
  @ApiOperation({ summary: 'My provider profile' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    const provider = await this.providersService.findMine(
      currentProviderId(user),
    );
    return this.withLogoUrl(provider);
  }

  /** Attaches the computed, publicly-servable logo URL to a provider response — `logoStorageKey` itself is an internal storage key, not something the frontend should build a URL out of. */
  private withLogoUrl(
    provider: Awaited<ReturnType<ProvidersService['findById']>>,
  ) {
    return {
      ...provider,
      logoUrl: this.providersService.publicLogoUrl(provider),
    };
  }

  @Patch('providers/me')
  @Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
  @ApiOperation({ summary: 'Edit my provider profile (e.g. tax ID)' })
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProviderDto,
  ) {
    return this.providersService.updateMine(currentProviderId(user), dto);
  }

  @Post('providers/me/verification-documents')
  @Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload a verification document (ID, business registration, address proof) for admin review',
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadVerificationDocument(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType?: ProviderVerificationDocumentType,
  ) {
    if (!file) {
      throw new DomainException(
        'FILE_REQUIRED',
        'A document file is required.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      !documentType ||
      !Object.values(ProviderVerificationDocumentType).includes(documentType)
    ) {
      throw new DomainException(
        'INVALID_DOCUMENT_TYPE',
        'A valid documentType is required.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.providersService.addVerificationDocument(
      currentProviderId(user),
      documentType,
      file,
    );
  }

  @Get('admin/providers')
  @Roles(...ADMIN_ROLES)
  @RequirePermission(AdminPermission.PROVIDER_READ)
  @ApiOperation({ summary: 'List/filter providers by verification status' })
  async listForAdmin(
    @Query('verificationStatus')
    verificationStatus?: ProviderVerificationStatus,
  ) {
    return this.providersService.listForAdmin(verificationStatus);
  }

  @Post('admin/providers/:id/verify')
  @Roles(...ADMIN_ROLES)
  @RequirePermission(AdminPermission.PROVIDER_VERIFY)
  @ApiOperation({
    summary:
      'Approve or reject a provider (24_ADMIN_ARCHITECTURE.md §24.2), reason required',
  })
  async verify(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyProviderDto,
  ) {
    return this.providersService.verify(id, user.userId, dto);
  }

  @Patch('admin/providers/:id/suspend')
  @Roles(...ADMIN_ROLES)
  @RequirePermission(AdminPermission.PROVIDER_SUSPEND)
  @ApiOperation({
    summary:
      'Suspend or reinstate a VERIFIED provider, reason required (33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §33.5)',
  })
  async setSuspended(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { suspended: boolean; notes?: string },
  ) {
    return this.providersService.setSuspended(
      id,
      user.userId,
      body.suspended,
      body.notes,
    );
  }

  @Get('admin/providers/:id/verification-documents/:storageKey')
  @Roles(...ADMIN_ROLES)
  @RequirePermission(AdminPermission.PROVIDER_READ)
  @ApiOperation({
    summary:
      'Download a provider verification document (admin-only — never publicly reachable)',
  })
  async downloadVerificationDocument(
    @Param('id') id: string,
    @Param('storageKey') storageKey: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType, originalFilename } =
      await this.providersService.getVerificationDocumentBuffer(id, storageKey);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(originalFilename)}"`,
    );
    res.send(buffer);
  }
}
