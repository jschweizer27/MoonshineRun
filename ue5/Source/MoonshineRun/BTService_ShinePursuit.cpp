#include "BTService_ShinePursuit.h"
#include "BehaviorTree/BehaviorTreeComponent.h"
#include "ProhibitionCopController.h"

UBTService_ShinePursuit::UBTService_ShinePursuit()
{
	NodeName = TEXT("Shine Pursuit");
	bNotifyTick = true;
	Interval = 0.1f;
	RandomDeviation = 0.f;
}

void UBTService_ShinePursuit::TickNode(UBehaviorTreeComponent& OwnerComp, uint8* NodeMemory, float DeltaSeconds)
{
	Super::TickNode(OwnerComp, NodeMemory, DeltaSeconds);
	if (AProhibitionCopController* AI = Cast<AProhibitionCopController>(OwnerComp.GetAIOwner()))
	{
		AI->UpdatePursuit(DeltaSeconds);
		AI->WriteBlackboard();
	}
}
