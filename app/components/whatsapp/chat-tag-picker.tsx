"use client";

import { useState, useEffect, useCallback } from "react";
import { TagChips, type TagOption } from "@/app/components/crm/tag-chips";
import { useToast } from "@/app/components/ui/toast";

export function ChatTagPicker({ chatId }: { chatId: string }) {
  const { error: toastError } = useToast();
  const [allTags, setAllTags] = useState<TagOption[]>([]);
  const [chatTags, setChatTags] = useState<TagOption[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const [allRes, chatRes] = await Promise.all([
        fetch(`/api/whatsapp/tags?chatId=${chatId}`),
        fetch(`/api/whatsapp/chats/${chatId}/tags`),
      ]);
      const allData = await allRes.json();
      const chatData = await chatRes.json();
      if (Array.isArray(allData)) setAllTags(allData);
      if (Array.isArray(chatData)) setChatTags(chatData);
    } catch {
      toastError("Error al cargar etiquetas");
    }
  }, [chatId, toastError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on chat change / dropdown open
    fetchAll();
  }, [fetchAll]);

  async function addTag(tagId: string) {
    const tag = allTags.find((t) => t.id === tagId);
    if (!tag) return;
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId }),
      });
      if (!res.ok) throw new Error();
      setChatTags((prev) => (prev.some((t) => t.id === tagId) ? prev : [...prev, tag]));
    } catch {
      toastError("Error al actualizar etiquetas");
    }
  }

  async function removeTag(tagId: string) {
    try {
      const res = await fetch(`/api/whatsapp/chats/${chatId}/tags?tagId=${tagId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setChatTags((prev) => prev.filter((t) => t.id !== tagId));
    } catch {
      toastError("Error al actualizar etiquetas");
    }
  }

  async function createTag(name: string) {
    try {
      const res = await fetch("/api/whatsapp/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, chatId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al crear etiqueta");
      const newTag: TagOption = data;
      setAllTags((prev) => [...prev, newTag]);
      const assign = await fetch(`/api/whatsapp/chats/${chatId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId: newTag.id }),
      });
      if (!assign.ok) throw new Error("La etiqueta se creó pero no se pudo asignar");
      setChatTags((prev) => [...prev, newTag]);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Error al crear etiqueta");
    }
  }

  return <TagChips tags={chatTags} allTags={allTags} onAdd={addTag} onRemove={removeTag} onCreate={createTag} />;
}
