import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

export async function getSecret(vaultName: string, secretName: string): Promise<string | undefined> {
  if (!vaultName) return undefined;
  const url = `https://${vaultName}.vault.azure.net`;
  const credential = new DefaultAzureCredential();
  const client = new SecretClient(url, credential);
  try {
    const secret = await client.getSecret(secretName);
    return secret.value || undefined;
  } catch (e: any) {
    // don't crash if secret not found; caller can handle
    console.warn(`KeyVault: could not read secret ${secretName} from ${vaultName}: ${e?.message || e}`);
    return undefined;
  }
}
