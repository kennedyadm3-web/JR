# Backup de Segurança - Versão Pré-Otimização de Quota Firestore

Data do Backup: 30 de Outubro de 2026

Este diretório contém cópias exatas e intocadas dos arquivos essenciais do sistema antes da aplicação das otimizações profundas de redução de leitura e custos do Firestore:

1. `src/services/dataService.ts`: Versão com leitura global de equipamentos e queries amplas.
2. `server.ts`: Versão com rota `/api/tech-demand/itinerary` e `/api/equipments` originais.
3. `src/components/TechDemandView.tsx`: Versão com carregamento síncrono de todos os equipamentos no boot.
4. `android-app/ServiceOrderRepository.kt`: Versão do app Android original com sincronização ampla.

### Como Restaurar (se necessário):
Caso deseje voltar qualquer um desses arquivos para o estado exato anterior:
- Copiar `backup_pre_optimization/src/services/dataService.ts` de volta para `src/services/dataService.ts`
- Copiar `backup_pre_optimization/server.ts` de volta para `server.ts`
- Copiar `backup_pre_optimization/src/components/TechDemandView.tsx` de volta para `src/components/TechDemandView.tsx`
- Copiar `backup_pre_optimization/android-app/ServiceOrderRepository.kt` de volta para `android-app/app/src/main/java/com/lefrio/atendimento/data/repository/ServiceOrderRepository.kt`
