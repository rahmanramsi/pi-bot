"use client"

import { Blobatar } from "blobatar/react"
import "blobatar/motion.css"

import { cn } from "@/lib/utils"

type BlobAvatarProps = {
  /** Who the avatar is for — the same name always renders the same blobatar. */
  name: string
  /** Intrinsic SVG size; display size is controlled via className. */
  size?: number
  /**
   * "hover" animates one blobatar at a time — the right default for lists and
   * grids. "always" idles continuously and is meant for single avatars such as
   * profile headers. Motion respects prefers-reduced-motion.
   */
  animate?: "hover" | "always"
  className?: string
  /** Only applies to static avatars; animated ones are aria-hidden SVGs. */
  alt?: string
}

function BlobAvatar({ name, size, animate, className, alt = "" }: BlobAvatarProps) {
  if (animate) {
    return (
      <Blobatar
        name={name}
        size={size}
        animate={animate}
        className={cn("blob-avatar", className)}
      />
    )
  }
  return (
    <Blobatar
      name={name}
      size={size}
      alt={alt}
      className={cn("blob-avatar", className)}
    />
  )
}

export { BlobAvatar }
export type { BlobAvatarProps }
