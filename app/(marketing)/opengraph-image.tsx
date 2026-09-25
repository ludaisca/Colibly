import { renderShareImage, SHARE_IMAGE_ALT } from "./_share-image";

export const alt = SHARE_IMAGE_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return renderShareImage();
}
