import { api } from "@/lib/api";

export async function downloadFile(
  url: string,
  params: Record<string, string | number | boolean>,
  filename: string,
) {
  const { data } = await api.get<Blob>(url, { params, responseType: "blob" });
  const blobUrl = window.URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}
