import { MEDIA_MAX_BYTES } from '@afrisime/shared';
import { ApiError } from '../http/errors';

/** Fichier envoyé (champ « file » d'un formulaire multipart), taille vérifiée avant lecture complète. */
export async function uploadedFile(req: Request): Promise<Buffer> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Envoyez la photo dans un formulaire (champ « file »).',
      { field: 'file' },
      422,
    );
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    throw new ApiError('VALIDATION_ERROR', 'Choisissez une photo.', { field: 'file' }, 422);
  }
  if (file.size > MEDIA_MAX_BYTES) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Photo trop lourde (5 Mo maximum).',
      { field: 'file' },
      422,
    );
  }
  return Buffer.from(await file.arrayBuffer());
}
