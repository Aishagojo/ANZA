"use client";

/**
 * Upload Video — Creator flow (design mockups 2 to 6).
 * Route: /creator-profile/upload. The upload logic lives in
 * components/content/UploadVideo.tsx and talks to the existing backend
 * endpoints unchanged; this page only provides the frame and navigation.
 */
import { useRouter } from "next/navigation";
import { AppShell, PageHeader } from "@/components/layout/AppShell";
import { UploadVideo } from "@/components/content/UploadVideo";

export default function UploadVideoPage() {
  const router = useRouter();
  const backToVideos = () => router.push("/creator-profile");

  return (
    <AppShell role="creator" active="videos" width="max-w-4xl">
      <PageHeader
        crumbs={[{ label: "My Videos", href: "/creator-profile" }, { label: "Upload Video" }]}
        eyebrow="Creator"
        title="Upload Video"
        subtitle="Upload an already-edited video to your ContentPort library."
      />
      <UploadVideo onCancel={backToVideos} onFinish={backToVideos} />
    </AppShell>
  );
}
