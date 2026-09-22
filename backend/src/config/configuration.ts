export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiBasePath: string;
  corsOrigin: string;
  // 22_INFRASTRUCTURE.md §22.7 — absolute origin the backend is reachable
  // at, used ONLY to turn a relative /uploads/<key> path into a full URL
  // for API responses (search.service.ts's photo URLs — the frontend runs
  // on its own separate domain, so a relative path would resolve against
  // the WRONG origin there). Defaults to Railway's auto-injected public
  // domain (RAILWAY_PUBLIC_DOMAIN) so this works with zero configuration
  // in that environment; PUBLIC_BACKEND_URL overrides it anywhere else.
  // null (local dev with no domain set) means URLs stay relative, which is
  // correct for same-origin local development.
  backendPublicUrl: string | null;
  db: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    ssl: boolean;
  };
  jwt: {
    accessSecret: string;
    accessExpiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  otp: {
    ttlSeconds: number;
    length: number;
  };
  oauth: {
    google: { clientId: string };
    facebook: { appId: string; appSecret: string };
  };
  payments: {
    primaryProvider: 'EPOINT' | 'PAYRIFF';
    epoint: { merchantId: string; secretKey: string; apiBaseUrl: string };
    payriff: { publicKey: string; secretKey: string; apiBaseUrl: string };
    // 13_PAYMENT_ARCHITECTURE.md §13.3 step 2 — where the hosted checkout
    // redirects the browser back to. No dedicated frontend-URL config
    // existed yet (frontend isn't built until P4-9/10), so this reuses
    // `corsOrigin` as the frontend origin, which is what it already is in
    // every environment this app runs in.
    successUrlTemplate: string; // {bookingId} placeholder
    errorUrlTemplate: string;
  };
  refund: {
    // 18_SECURITY.md §18.2 — "Support/Operations... can action refunds
    // within a configured limit... anything above threshold requires
    // Platform Admin escalation." No AZN figure is fixed in any approved
    // document, so — same discipline as BOOKING_SERVICE_FEE_PERCENTAGE —
    // this defaults to 0 (nothing auto-approves; everything escalates)
    // until a real business threshold is set, rather than guessing one.
    autoApproveLimitMinorUnits: number;
  };
  payout: {
    // 14_PAYOUT_LEDGER.md §14.5 doesn't fix a minimum batch amount — same
    // "don't invent an unstated business threshold" discipline as
    // refund.autoApproveLimitMinorUnits: defaults to 0, so any positive
    // eligible balance batches; a zero/negative balance is always left
    // unbatched regardless of this setting (PayoutsService.batchOnePayee).
    minPayoutAmountMinorUnits: number;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
  };
  storage: {
    driver: 'local' | 's3';
    localPath: string;
    // Provider verification documents (ID, business registration proof) —
    // a SEPARATE directory from `localPath`, never covered by static
    // middleware (see storage.module.ts / main.ts). These are sensitive
    // personal/legal documents and must stay admin-only, never publicly
    // reachable by a guessable URL.
    privateLocalPath: string;
    s3: {
      endpoint: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      region: string;
    };
  };
  booking: { holdMinutes: number; serviceFeePercentage: number };
  commission: { platformDefaultPercentage: number };
  partner: {
    // 31_PARTNER_REFERRAL_ARCHITECTURE.md — the marketplace's public name/
    // domain are not finalized yet (per the conversation record: do not
    // hardcode a brand name anywhere brand-dependent). `publicBaseUrl` is
    // ONLY used to build a convenience `trackingUrl` string in admin API
    // responses (e.g. "https://example.com/r/CODE") — the `/r/:code` route
    // itself works correctly regardless of this value, since it only reads
    // the incoming request. Defaults to a placeholder rather than guessing
    // a real domain.
    publicBaseUrl: string;
    // Pepper for hashing the visitor IP before storing it
    // (referral_click.ip_hash — 18_SECURITY.md spirit: never store raw IP).
    ipHashSalt: string;
  };
  search: {
    // 16_SEARCH_ARCHITECTURE.md §16.3 — relevance weights are configuration,
    // not hardcoded constants, "so they can be tuned post-launch based on
    // real conversion data without a deployment." Availability isn't
    // weighted here because it's a hard exclude (§16.3: "binary... else
    // excluded entirely, not just down-ranked"), never a score term.
    // Starting values are a Phase 2 tuning detail per the doc — chosen here
    // to weight fit-to-request (price/capacity/amenities) and proximity
    // roughly as heavily as reputation, not derived from real data yet.
    weights: {
      price: number;
      distance: number;
      rating: number;
      amenityMatch: number;
      capacityFit: number;
    };
    cacheTtlSeconds: number;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  apiBasePath: process.env.API_BASE_PATH || '/api/v1',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  backendPublicUrl:
    process.env.PUBLIC_BACKEND_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : null),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'flexspace',
    password: process.env.DB_PASSWORD || 'flexspace_dev_password',
    database: process.env.DB_DATABASE || 'flexspace',
    ssl: process.env.DB_SSL === 'true',
  },
  jwt: {
    accessSecret:
      process.env.JWT_ACCESS_SECRET || 'DEV_ONLY_INSECURE_SECRET_CHANGE_ME',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ||
      'DEV_ONLY_INSECURE_REFRESH_SECRET_CHANGE_ME',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
  otp: {
    ttlSeconds: parseInt(process.env.OTP_TTL_SECONDS || '300', 10),
    length: parseInt(process.env.OTP_LENGTH || '6', 10),
  },
  oauth: {
    google: {
      // Only the Client ID is needed server-side — verifying a Google ID
      // token (an already-signed JWT the client obtained directly from
      // Google) needs no client secret at all, unlike the redirect-code
      // OAuth flow. Empty string = feature off; AuthService.loginWithGoogle
      // refuses with a clear error rather than silently misbehaving (same
      // "REQUIRES USER ACTION" posture as SmsChannel).
      clientId: process.env.GOOGLE_CLIENT_ID || '',
    },
    facebook: {
      appId: process.env.FACEBOOK_APP_ID || '',
      appSecret: process.env.FACEBOOK_APP_SECRET || '',
    },
  },
  payments: {
    primaryProvider:
      (process.env.PAYMENT_PRIMARY_PROVIDER as 'EPOINT' | 'PAYRIFF') ||
      'EPOINT',
    epoint: {
      merchantId: process.env.EPOINT_MERCHANT_ID || '',
      secretKey: process.env.EPOINT_SECRET_KEY || '',
      apiBaseUrl: process.env.EPOINT_API_BASE_URL || 'https://api.epoint.az',
    },
    payriff: {
      publicKey: process.env.PAYRIFF_PUBLIC_KEY || '',
      secretKey: process.env.PAYRIFF_SECRET_KEY || '',
      apiBaseUrl: process.env.PAYRIFF_API_BASE_URL || 'https://api.payriff.com',
    },
    successUrlTemplate:
      process.env.PAYMENT_SUCCESS_URL_TEMPLATE ||
      `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/booking/{bookingId}/confirming`,
    errorUrlTemplate:
      process.env.PAYMENT_ERROR_URL_TEMPLATE ||
      `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/booking/{bookingId}/failed`,
  },
  refund: {
    autoApproveLimitMinorUnits: parseInt(
      process.env.REFUND_AUTO_APPROVE_LIMIT_MINOR_UNITS || '0',
      10,
    ),
  },
  payout: {
    minPayoutAmountMinorUnits: parseInt(
      process.env.PAYOUT_MIN_AMOUNT_MINOR_UNITS || '0',
      10,
    ),
  },
  smtp: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '1025', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || 'FlexSpace <no-reply@flexspace.az>',
  },
  storage: {
    driver: (process.env.STORAGE_DRIVER as 'local' | 's3') || 'local',
    localPath: process.env.STORAGE_LOCAL_PATH || './uploads',
    privateLocalPath:
      process.env.STORAGE_PRIVATE_LOCAL_PATH || './uploads-private',
    s3: {
      endpoint: process.env.S3_ENDPOINT || '',
      bucket: process.env.S3_BUCKET || '',
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      region: process.env.S3_REGION || 'auto',
    },
  },
  booking: {
    holdMinutes: parseInt(process.env.BOOKING_HOLD_MINUTES || '15', 10),
    // 05_USER_FLOWS.md §5.2 shows a customer-facing "service fee" line item,
    // but no approved document fixes a rate (09_DOMAIN_MODEL.md §9.2 and
    // 10_DATABASE_SCHEMA.md §10.6 only fix the FIELD, not its value).
    // Defaulting to 0 rather than inventing a number — this is a pending
    // business decision (REQUIRES USER ACTION), not an architecture gap;
    // total_amount = gross_amount + service_fee_amount stays correct either way.
    serviceFeePercentage: parseFloat(
      process.env.BOOKING_SERVICE_FEE_PERCENTAGE || '0',
    ),
  },
  commission: {
    platformDefaultPercentage: parseFloat(
      process.env.PLATFORM_DEFAULT_COMMISSION_PERCENTAGE || '12.00',
    ),
  },
  partner: {
    publicBaseUrl:
      process.env.PARTNER_PUBLIC_BASE_URL || '[MARKETPLACE_DOMAIN]',
    ipHashSalt:
      process.env.PARTNER_IP_HASH_SALT || 'DEV_ONLY_INSECURE_IP_SALT_CHANGE_ME',
  },
  search: {
    weights: {
      price: parseFloat(process.env.SEARCH_WEIGHT_PRICE || '0.25'),
      distance: parseFloat(process.env.SEARCH_WEIGHT_DISTANCE || '0.25'),
      rating: parseFloat(process.env.SEARCH_WEIGHT_RATING || '0.25'),
      amenityMatch: parseFloat(
        process.env.SEARCH_WEIGHT_AMENITY_MATCH || '0.15',
      ),
      capacityFit: parseFloat(process.env.SEARCH_WEIGHT_CAPACITY_FIT || '0.10'),
    },
    // §16.4 — "a short-TTL (e.g. 30-60 second) read-through cache... for the
    // most repeated query shapes." Not implemented in this pass (no Redis
    // instance wired up yet, 22_INFRASTRUCTURE.md — REQUIRES USER ACTION
    // for provisioning); the config key exists so the cache layer has
    // somewhere to read its TTL from once it's added, without a schema
    // change. See PHASE4_REPORT.md KNOWN LIMITATIONS.
    cacheTtlSeconds: parseInt(process.env.SEARCH_CACHE_TTL_SECONDS || '45', 10),
  },
});
