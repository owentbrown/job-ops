import * as api from "@client/api";
import { showErrorToast } from "@client/lib/error-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const SIGNATURE_KEY = ["cover-letter", "signature"] as const;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export const SignatureCard: React.FC<{ className?: string }> = ({
  className,
}) => {
  const queryClient = useQueryClient();
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

  const signature = useQuery({
    queryKey: SIGNATURE_KEY,
    queryFn: () => api.getSignatureStatus(),
    staleTime: 60_000,
  });

  // dataUpdatedAt reloads the preview after Replace (same exists=true).
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch trigger
  useEffect(() => {
    if (!signature.data?.exists) {
      setSignatureUrl(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    api
      .getSignatureBlob()
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSignatureUrl(url);
      })
      .catch(() => setSignatureUrl(null));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [signature.data?.exists, signature.dataUpdatedAt]);
  const uploadSignature = useMutation({
    mutationFn: async (file: File) => {
      if (file.type && file.type !== "image/png") {
        throw new Error("Use a PNG image for the signature.");
      }
      return api.uploadSignature(await readFileAsBase64(file));
    },
    onSuccess: async () => {
      toast.success("Signature saved");
      await queryClient.invalidateQueries({ queryKey: SIGNATURE_KEY });
    },
    onError: (error) => showErrorToast(error, "Could not save the signature"),
  });

  const removeSignature = useMutation({
    mutationFn: () => api.removeSignature(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SIGNATURE_KEY });
    },
    onError: (error) => showErrorToast(error, "Could not remove the signature"),
  });

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 border-t border-border/50 pt-4",
        className,
      )}
    >
      <span className="text-xs text-muted-foreground">Signature:</span>
      {signatureUrl ? (
        <img
          src={signatureUrl}
          alt="Your signature"
          className="h-8 rounded bg-white px-1"
        />
      ) : (
        <span className="text-xs text-muted-foreground">
          {signature.isLoading
            ? "Checking…"
            : "None (letter ends with your name)"}
        </span>
      )}
      <input
        ref={signatureInputRef}
        type="file"
        accept="image/png"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) uploadSignature.mutate(file);
        }}
      />
      <Button
        size="sm"
        variant="ghost"
        disabled={uploadSignature.isPending}
        onClick={() => signatureInputRef.current?.click()}
      >
        <Upload className="h-3.5 w-3.5" />
        {signature.data?.exists ? "Replace" : "Upload PNG"}
      </Button>
      {signature.data?.exists ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={removeSignature.isPending}
          onClick={() => removeSignature.mutate()}
        >
          Remove
        </Button>
      ) : null}
    </div>
  );
};
