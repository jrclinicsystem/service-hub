from pathlib import Path
p = Path('src/components/admin-sellers-workspace.tsx')
s = p.read_text()
s = s.replace('    if (!term) return sellers;\n    return sellers.filter((seller) =>', '    const visibleSellers = sellers.filter((seller) => !seller.deleted_at);\n    if (!term) return visibleSellers;\n    return visibleSellers.filter((seller) =>', 1)
s = s.replace('description: "O histórico de vendas e comissões foi mantido no perfil."', 'description: "O histórico de vendas e comissões foi preservado internamente."', 1)
p.write_text(s)
