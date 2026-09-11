from pathlib import Path

path = Path('src/components/client-profile-dialog.tsx')
text = path.read_text()

text = text.replace('''    if (!clientId || name.trim().length < 2) return toast.error("Informe o nome do cliente.");
    if (digits(whatsapp).length < 10) return toast.error("Informe um WhatsApp válido.");''', '''    if (!clientId || name.trim().length < 2) { toast.error("Informe o nome do cliente."); return undefined; }
    if (digits(whatsapp).length < 10) { toast.error("Informe um WhatsApp válido."); return undefined; }''')
text = text.replace('''    if (result.error) return toast.error("Não foi possível salvar a ficha.", { description: result.error.message });
    toast.success("Ficha do cliente atualizada.");
    await refresh();
    await onUpdated?.();
  };''', '''    if (result.error) { toast.error("Não foi possível salvar a ficha.", { description: result.error.message }); return undefined; }
    toast.success("Ficha do cliente atualizada.");
    await refresh();
    await onUpdated?.();
    return undefined;
  };''', 1)
text = text.replace('''        const uploaded = await supabase.storage.from("client-records").upload(path, file, { upsert: false, contentType: file.type || undefined });''', '''        const uploadOptions = file.type ? { upsert: false, contentType: file.type } : { upsert: false };
        const uploaded = await supabase.storage.from("client-records").upload(path, file, uploadOptions);''')
text = text.replace('''    } finally {
      setUploading(false);
    }
  };''', '''    } finally {
      setUploading(false);
    }
    return undefined;
  };''', 1)
text = text.replace('''    if (error || !data?.signedUrl) return toast.error("Não foi possível abrir o arquivo.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };''', '''    if (error || !data?.signedUrl) { toast.error("Não foi possível abrir o arquivo."); return undefined; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    return undefined;
  };''')
text = text.replace('''    if (removed.error) return toast.error("Não foi possível excluir o arquivo.", { description: removed.error.message });
    const deleted = await db.from("client_documents").delete().eq("id", doc.id);
    if (deleted.error) return toast.error("O arquivo foi removido, mas o registro não pôde ser apagado.", { description: deleted.error.message });
    toast.success("Arquivo removido da ficha.");
    await refresh();
  };''', '''    if (removed.error) { toast.error("Não foi possível excluir o arquivo.", { description: removed.error.message }); return undefined; }
    const deleted = await db.from("client_documents").delete().eq("id", doc.id);
    if (deleted.error) { toast.error("O arquivo foi removido, mas o registro não pôde ser apagado.", { description: deleted.error.message }); return undefined; }
    toast.success("Arquivo removido da ficha.");
    await refresh();
    return undefined;
  };''')
text = text.replace('''    if (!clientId) return;
    const validRows = budgetRows.filter((row) => row.serviceId);
    if (!validRows.length) return toast.error("Adicione pelo menos um serviço ao orçamento.");''', '''    if (!clientId) return undefined;
    const validRows = budgetRows.filter((row) => row.serviceId);
    if (!validRows.length) { toast.error("Adicione pelo menos um serviço ao orçamento."); return undefined; }''')
text = text.replace('''    } finally {
      setBudgetSaving(false);
    }
  };''', '''    } finally {
      setBudgetSaving(false);
    }
    return undefined;
  };''', 1)
text = text.replace('''    if (result.error) return toast.error(result.error.message);
    await refresh();
  };''', '''    if (result.error) { toast.error(result.error.message); return undefined; }
    await refresh();
    return undefined;
  };''', 1)
text = text.replace('''    if (result.error) return toast.error(result.error.message);
    toast.success("Orçamento excluído.");
    await refresh();
  };''', '''    if (result.error) { toast.error(result.error.message); return undefined; }
    toast.success("Orçamento excluído.");
    await refresh();
    return undefined;
  };''', 1)

path.write_text(text)
