import { format, register } from 'timeago.js';
import es from 'timeago.js/esm/lang/es.js';

register('es', es);

/**
 * Configurable UI copy. Every string has a Spanish default so existing users
 * keep the current appearance and wording.
 */
export interface CommentsMessages {
  title: string;
  empty: string;
  loading: string;
  submit: string;
  submitting: string;
  showMore: string;
  showLess: string;
  retry: string;
  loadError: string;
  publishError: string;
  deleteError: string;
  reactionError: string;
  emojiPickerLabel: string;
  reactionLabel: string;
  deleteLabel: string;
  composerLabel: string;
  tooShort: (min: number) => string;
  tooLong: (max: number) => string;
  charLimitHint: (max: number) => string;
  published: string;
  deleted: string;
  commentCount: (count: number) => string;
  /** Fecha relativa mostrada en cada comentario (por defecto, "hace 5 minutos"). */
  timeAgo: (date: string) => string;
}

export const DEFAULT_MESSAGES: CommentsMessages = {
  title: 'Comentarios',
  empty: 'No hay comentarios aún',
  loading: 'Cargando comentarios',
  submit: 'Publicar comentario',
  submitting: 'Publicando...',
  showMore: 'Ver más',
  showLess: 'Ver menos',
  retry: 'Reintentar',
  loadError: 'No se pudieron cargar los comentarios',
  publishError: 'No se pudo publicar el comentario',
  deleteError: 'No se pudo eliminar el comentario',
  reactionError: 'No se pudo guardar la reacción',
  emojiPickerLabel: 'Añadir emoji',
  reactionLabel: 'Reaccionar al comentario con',
  deleteLabel: 'Eliminar comentario de',
  composerLabel: 'Escribe un comentario',
  tooShort: (min) => `El comentario debe tener al menos ${min} caracteres`,
  tooLong: (max) => `El comentario no puede exceder ${max} caracteres`,
  charLimitHint: (max) => `Máximo ${max} caracteres`,
  published: 'Comentario publicado',
  deleted: 'Comentario eliminado',
  commentCount: (count) =>
    count === 1 ? '1 comentario' : `${count} comentarios`,
  timeAgo: (date) => format(date, 'es'),
};
