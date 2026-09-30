#include "BTTask_ShinePickRoadPoint.h"
#include "BehaviorTree/BehaviorTreeComponent.h"
#include "BehaviorTree/BlackboardComponent.h"
#include "Kismet/GameplayStatics.h"
#include "ProhibitionCopController.h"

UBTTask_ShinePickRoadPoint::UBTTask_ShinePickRoadPoint()
{
	NodeName = TEXT("Shine Pick Road Point");
	BlackboardKey.AddVectorFilter(this, GET_MEMBER_NAME_CHECKED(UBTTask_ShinePickRoadPoint, BlackboardKey));
}

EBTNodeResult::Type UBTTask_ShinePickRoadPoint::ExecuteTask(UBehaviorTreeComponent& OwnerComp, uint8* NodeMemory)
{
	AProhibitionCopController* AI = Cast<AProhibitionCopController>(OwnerComp.GetAIOwner());
	UBlackboardComponent* BB = OwnerComp.GetBlackboardComponent();
	if (!AI || !AI->GetPawn() || !BB)
	{
		return EBTNodeResult::Failed;
	}
	FVector Origin = AI->GetPawn()->GetActorLocation();
	if (Around == EShinePointOrigin::LastKnown)
	{
		Origin = AI->LastKnownLocation;
	}
	else if (Around == EShinePointOrigin::Player)
	{
		if (const APawn* Player = UGameplayStatics::GetPlayerPawn(AI, 0))
		{
			Origin = Player->GetActorLocation();
		}
	}
	BB->SetValueAsVector(BlackboardKey.SelectedKeyName, AI->PickRoadPoint(Origin, Radius));
	return EBTNodeResult::Succeeded;
}
