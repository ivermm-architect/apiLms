import { Field, ObjectType, Query, Resolver } from '@nestjs/graphql';

import { Public } from '../../auth/infrastructure/decorators/public.decorator';
import { DrizzleSystemConfigRepository } from '../infrastructure/drizzle-config.repository';

const CONFIG_KEY = 'system_config';

/**
 * Branding público (no sensible) legible por cualquier rol e incluso sin sesión.
 * Se usa para inyectar el tema en SSR antes del primer paint (cero flash).
 */
@ObjectType()
class PublicBrandingType {
  @Field(() => String, { nullable: true }) primaryColor?: string | null;
  @Field(() => String, { nullable: true }) secondaryColor?: string | null;
  @Field(() => String, { nullable: true }) platformName?: string | null;
  @Field(() => String, { nullable: true }) logoUrl?: string | null;
  @Field(() => String, { nullable: true }) faviconUrl?: string | null;
  @Field(() => String, { nullable: true }) footerText?: string | null;
}

interface StoredBranding {
  branding?: {
    primaryColor?: string;
    secondaryColor?: string;
    platformName?: string;
    logoUrl?: string;
    faviconUrl?: string;
    footerText?: string;
  };
}

@Resolver()
export class PublicBrandingResolver {
  constructor(private readonly config: DrizzleSystemConfigRepository) {}

  @Public()
  @Query(() => PublicBrandingType, { nullable: true })
  async publicBranding(): Promise<PublicBrandingType | null> {
    const value = (await this.config.get(CONFIG_KEY)) as StoredBranding | null;
    const branding = value?.branding;
    if (!branding) return null;
    return {
      primaryColor: branding.primaryColor ?? null,
      secondaryColor: branding.secondaryColor ?? null,
      platformName: branding.platformName ?? null,
      logoUrl: branding.logoUrl ?? null,
      faviconUrl: branding.faviconUrl ?? null,
      footerText: branding.footerText ?? null,
    };
  }
}
