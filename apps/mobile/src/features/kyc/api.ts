import { type KycDocType, type KycPhoto, KycState } from '@afrisime/shared';
import { request, uploadForm } from '@/api/client';
import { apiConfig } from '@/api/config';
import { mockKycApi } from '@/api/mock/kyc';

export type KycPhotoFile = { uri: string; mimeType?: string | null };

export type KycSubmission = {
  docType: KycDocType;
  docNumber: string;
  photos: Partial<Record<KycPhoto, KycPhotoFile>>;
};

/** Vérification d'identité (au-delà d'un seuil d'achats sur 30 jours). */
export type KycApi = {
  get(signal?: AbortSignal): Promise<KycState>;
  submit(input: KycSubmission): Promise<KycState>;
};

const httpKycApi: KycApi = {
  get(signal) {
    return request('/v1/me/kyc', { schema: KycState, signal });
  },
  submit(input) {
    const form = new FormData();
    form.append('docType', input.docType);
    form.append('docNumber', input.docNumber.trim());
    for (const [kind, file] of Object.entries(input.photos)) {
      if (!file) continue;
      const type = file.mimeType ?? 'image/jpeg';
      // Format attendu par React Native pour joindre un fichier du téléphone.
      form.append(kind, { uri: file.uri, name: `${kind}.${type.split('/')[1] ?? 'jpg'}`, type } as unknown as Blob);
    }
    return uploadForm('/v1/me/kyc', form, KycState);
  },
};

export const kycApi: KycApi = apiConfig.mock ? mockKycApi : httpKycApi;
