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

### 🛠️ Dia 3: Execução de Atendimento & Checklist Operacional dos Equipamentos (CONCLUÍDO)
- [x] Tela de Detalhes da O.S. (`OrderDetailScreen.kt` & `OrderDetailViewModel.kt`).
- [x] Botão de Navegação GPS integrado diretamente com Google Maps e Waze via Intent nativa.
- [x] Barra de progresso percentual e contagem de máquinas inspecionadas em tempo real.
- [x] Card de Equipamento (`EquipmentCard.kt`) com especificações (BTUs, setor, marca, patrimônio).
- [x] Modal de Checklist Operacional (`EquipmentInspectionDialog.kt`) com testes rápidos e justificativa obrigatória para não-execução.
- [x] Módulo de Câmera Nativa (`PhotoCaptureManager.kt`) com salvamento seguro local e compressão automática de imagem.
- [x] Miniaturas com galeria de fotos de evidência e exclusão individual.
- [x] Navegação fluida no `MainActivity.kt` entre Dashboard e Detalhes da O.S.

---

### ✍️ Dia 4: Captura de Assinatura Digital, Carimbo de Data/Hora e Auditoria GPS (CONCLUÍDO)
- [x] Pad de Assinatura Digital nativo em Canvas com traço sensível ao toque (`SignaturePad.kt`).
- [x] Salvamento local imediato da assinatura em arquivo de imagem PNG no smartphone.
- [x] Módulo de Auditoria de Localização GPS (`GpsAuditManager.kt`) com captura precisa via Google Play Services.
- [x] Tela de Assinatura e Coleta de Dados do Recebedor (`SignatureScreen.kt` & `SignatureViewModel.kt`).
- [x] Campos obrigatórios de Nome Completo e Documento (RG ou CPF) do recebedor no cliente.
- [x] Encerramento atômico no banco local Room com trancamento da O.S. para edição (`isLockedForEdit`).
- [x] Enfileiramento na Fila de Sincronização com dados completos para espelhamento com o Firestore.
- [x] Tela de Comprovante de Conclusão e retorno ao Painel de Ordens de Serviço.

---

### 🔄 Dia 5: Sincronização em Segundo Plano (WorkManager), Relatório PDF e Homologação Final (CONCLUÍDO)
- [x] Agendamento de sincronização background proativa com `WorkManager` (`SyncWorker.kt`).
- [x] Geração nativa de Relatório Técnico de Atendimento em PDF (`PdfReportGenerator.kt`).
- [x] Compartilhamento direto do relatório PDF para WhatsApp, E-mail ou Impressão (`OrderSummaryScreen.kt`).
- [x] Auditoria com assinatura do cliente e coordenadas GPS gravadas no comprovante.
- [x] Resiliência de perda-zero: todos os dados salvos no banco local Room antes do envio à nuvem.
- [x] Incremento de versão para v1.0.1 (`versionCode = 2`) e integração com o sistema de Auto-Update.

---

### 💰 Dia 6: Central de Produtividade do Técnico & Controle de Despesas de Rota (CONCLUÍDO)
- [x] Entidade Room `RouteExpenseEntity` e DAO `RouteExpenseDao` para persistência local de despesas.
- [x] Tela de Despesas de Viagem e Rota (`RouteExpensesScreen.kt` & `RouteExpensesViewModel.kt`).
- [x] Lançamento rápido por categorias operacionais: Combustível, Pedágio, Alimentação, Hospedagem, Peças/Materiais e Outros.
- [x] Captura de foto do cupom fiscal / nota de abastecimento com câmera nativa.
- [x] Sincronização automática com a coleção `routeExpenses` do Firestore.
- [x] Extrato financeiro em tempo real com total gasto pelo técnico durante a jornada.
- [x] Atalho direto e ícone de acesso rápido no Dashboard do técnico.

---

### 🚨 Dia 7: Central de Avisos Operacionais, Chamados de Emergência & Discagem Rápida (CONCLUÍDO)
- [x] Entidade Room `TechNotificationEntity` e DAO `TechNotificationDao` para alertas operacionais offline.
- [x] Tela de Notificações e Chamados de Emergência (`TechNotificationsScreen.kt` & `NotificationsViewModel.kt`).
- [x] Alerta prioritário para chamados emergenciais (Chiller parado / Câmara fria / Sala cirúrgica).
- [x] Botão de Discagem Rápida (`Intent.ACTION_DIAL`) para ligar diretamente para o cliente com 1 toque.
- [x] Badge e contador de avisos não lidos integrado na TopAppBar do Dashboard.
- [x] Ação de "Marcar todas como lidas" para manter a fila limpa.

---

### 🛡️ Etapa Final: Perfil do Técnico, Diagnóstico do Aparelho & Homologação Completa (CONCLUÍDO)
- [x] Tela de Perfil do Técnico e Telemetria do Smartphone (`TechProfileScreen.kt`).
- [x] Diagnóstico em tempo real: status de conexão (Wi-Fi/4G/Offline), armazenamento livre (GB) e saúde do banco Room.
- [x] Central de verificação de atualizações in-app e gatilho de sincronização forçada manual.
- [x] Navegação rápida e fluida com toque no nome do técnico ou avatar do Dashboard.
- [x] Projeto 100% homologado, desacoplado e pronto para produção corporativa.
