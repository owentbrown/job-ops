import { Toaster as Sonner } from "sonner";
import { useAppearance } from "@/client/lib/appearance/AppearanceProvider";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  // Follow the live appearance mode (System resolves against the OS).
  const { resolvedMode } = useAppearance();
  return (
    <Sonner
      theme={resolvedMode}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          content:
            "group-[.toast]:w-full group-[.toast]:flex-1 group-[.toast]:min-w-0",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
