# Planejamento do Aplicativo Android Nativo — Atendimento Técnico LeFrio

Este diretório contém o código-fonte, arquitetura e configurações exclusivas do **Aplicativo Android** (sistema operacional Android, instalável no dispositivo).
> **Aviso Importante de Isolamento:** O Sistema PWA (Web) permanece inalterado e preservado. Todo o desenvolvimento aqui é restrito ao aplicativo Android nativo.

---

## Cronograma de Desenvolvimento

### 🚀 Dia 1: Fundação, Arquitetura e Camada Offline-First (EM ANDAMENTO)
- [x] Estruturação do projeto Android (`com.lefrio.atendimento`).
- [x] Configuração do Manifesto Android (`AndroidManifest.xml`) com permissões críticas:
  - Câmera (`android.permission.CAMERA`)
  - Localização GPS de Auditoria (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`)
  - Rede e Estado de Conexão (`INTERNET`, `ACCESS_NETWORK_STATE`)
  - Armazenamento de Fotos e Assinaturas
- [x] Definição dos Modelos de Entidades de Dados (O.S., Atendimento, Checklist, Assinatura, Fotos, GPS).
- [x] Camada de Persistência Local Offline-First (Room Database / SQLite local):
  - Nada se perde se o técnico estiver sem internet, em subsolo ou área rural.
  - Gravação instantânea no banco local.
- [x] Fila de Sincronização Resiliente (`SyncQueue`) para envio automático ao Firestore assim que a conexão for restabelecida.

---

### 📱 Dia 2: Telas Iniciais, Autenticação do Técnico e Lista de Ordens de Serviço (CONCLUÍDO)
- [x] Tela de Login (`LoginScreen.kt`) com design moderno e identificação da empresa.
- [x] Persistência de sessão do técnico e suporte a login offline (`AuthRepository.kt` & `AuthViewModel.kt`).
- [x] Monitor de rede em tempo real (`NetworkMonitor.kt`).
- [x] Barra de status de sincronização (`SyncStatusBar.kt`): Online, Offline ou Pendências.
- [x] Painel de Ordens de Serviço (`DashboardScreen.kt` & `DashboardViewModel.kt`):
  - Contadores rápidos de O.S. (Todas, Abertas, Em Andamento, Finalizadas).
  - Busca instantânea por cliente, endereço ou número de O.S.
  - Cards detalhados com tipo de manutenção e ações rápidas (`ServiceOrderCard.kt`).
- [x] Integração da Activity principal com Jetpack Compose (`MainActivity.kt`).

---

### 🛠️ Dia 3: Execução de Atendimento & Checklist Operacional dos Equipamentos
- Detalhes da Ordem de Serviço com visualização do endereço e navegação GPS (Google Maps / Waze).
- Listagem de todas as máquinas instaladas no local (Split, ACJ, Chiller, etc.).
- Modal/Tela de preenchimento do checklist para cada equipamento.
- Captura de fotos obrigatórias com compressão automática e salvamento local imediato.
- Justificativas operacionais para equipamentos não executados ou com pendências.

---

### ✍️ Dia 4: Captura de Assinatura Digital, Carimbo de Data/Hora e Auditoria GPS
- Pad de assinatura digital em tela cheia com alta sensibilidade ao toque.
- Coleta do nome legível e documento do recebedor do cliente.
- Captura forçada das coordenadas GPS no exato momento da assinatura e do encerramento.
- Validação de integridade: bloqueio de alteração após assinatura.

---

### 🔄 Dia 5: Sincronização em Segundo Plano (WorkManager), Testes de Carga e Geração de Pacote APK
- Agendamento de sync background com `WorkManager`.
- Teste de corte abrupto de conexão durante preenchimento para homologação de perda-zero.
- Geração e build de APK de produção / homologação para instalação nos celulares dos técnicos.
