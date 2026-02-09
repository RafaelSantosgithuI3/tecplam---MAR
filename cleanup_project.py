import os
import shutil

# Configuração dos alvos para exclusão
DIRS_TO_DELETE = [
    "vite-project",
    "BD TESTE"
]

FILES_TO_DELETE = [
    "clean_db.js",
    "fix_database.js",
    "fix_db.js",
    "database.sqlite",
    "dummy.db"
]

def cleanup():
    print("🚀 Iniciando Protocolo de Limpeza...")
    root_dir = os.getcwd()
    
    # 1. Deletar Pastas
    for dir_name in DIRS_TO_DELETE:
        dir_path = os.path.join(root_dir, dir_name)
        if os.path.exists(dir_path):
            try:
                shutil.rmtree(dir_path)
                print(f"✅ Pasta removida: {dir_name}")
            except Exception as e:
                print(f"❌ Erro ao remover pasta {dir_name}: {e}")
        else:
            print(f"⚠️ Pasta não encontrada (já limpa?): {dir_name}")

    # 2. Deletar Arquivos
    for file_name in FILES_TO_DELETE:
        file_path = os.path.join(root_dir, file_name)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                print(f"✅ Arquivo removido: {file_name}")
            except Exception as e:
                print(f"❌ Erro ao remover arquivo {file_name}: {e}")
        else:
            print(f"⚠️ Arquivo não encontrado (já limpo?): {file_name}")

    print("\n✨ Limpeza Concluída! Estrutura do projeto otimizada.")

if __name__ == "__main__":
    cleanup()
