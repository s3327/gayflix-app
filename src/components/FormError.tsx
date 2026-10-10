/**
 * An error message under a form. role="alert" so screen readers announce
 * it when it appears; renders nothing when there's no message.
 */
export default function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm font-medium text-status-error">
      {message}
    </p>
  );
}
