export const CIRCLE_TESTNET_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

// Native XLM Stellar Asset Contract on Testnet (well-known SDF Testnet address)
export const XLM_TESTNET_SAC_ID = process.env.XLM_SAC_CONTRACT_ID || 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

// Derived or configured Circle Testnet USDC SAC ID
export const USDC_TESTNET_SAC_ID = process.env.USDC_SAC_CONTRACT_ID || '';

export type SupportedAsset = 'XLM' | 'USDC';

export interface AssetDetails {
  code: SupportedAsset;
  name: string;
  decimals: 7;
  issuer?: string;
  sacContractId: string;
}

export function getAssetConfig(asset: SupportedAsset): AssetDetails {
  if (asset === 'XLM') {
    return {
      code: 'XLM',
      name: 'Stellar Lumens (Native Testnet)',
      decimals: 7,
      sacContractId: XLM_TESTNET_SAC_ID,
    };
  }

  if (asset === 'USDC') {
    return {
      code: 'USDC',
      name: 'Circle Testnet USDC',
      decimals: 7,
      issuer: CIRCLE_TESTNET_USDC_ISSUER,
      sacContractId: USDC_TESTNET_SAC_ID,
    };
  }

  throw new Error(`Unsupported asset: ${asset}`);
}

/**
 * Converts a human-readable decimal string (e.g. "15.5") to 7-decimal integer base units ("155000000").
 */
export function toBaseUnits(amountStr: string): string {
  const parts = amountStr.trim().split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').slice(0, 7).padEnd(7, '0');
  const baseBigInt = BigInt(whole) * 10_000_000n + BigInt(frac);
  return baseBigInt.toString();
}

/**
 * Converts integer base units (e.g. "155000000") to formatted decimal string ("15.5000000").
 */
export function fromBaseUnits(baseUnitsStr: string): string {
  const value = BigInt(baseUnitsStr);
  const whole = value / 10_000_000n;
  const frac = (value % 10_000_000n).toString().padStart(7, '0');
  return `${whole}.${frac}`;
}

/**
 * Converts centavos (e.g. 1500000) to formatted PHP string ("₱15,000.00").
 */
export function formatPhp(minorUnits: number): string {
  const pesos = (minorUnits / 100).toFixed(2);
  return `₱${Number(pesos).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
