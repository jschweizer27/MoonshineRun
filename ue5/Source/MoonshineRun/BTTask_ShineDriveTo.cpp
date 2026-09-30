#include "BTTask_ShineDriveTo.h"
#include "AITypes.h"
#include "BehaviorTree/BehaviorTreeComponent.h"
#include "BehaviorTree/BlackboardComponent.h"
#include "BehaviorTree/Blackboard/BlackboardKeyType_Object.h"
#include "ProhibitionCopController.h"

UBTTask_ShineDriveTo::UBTTask_ShineDriveTo()
{
	NodeName = TEXT("Shine Drive To");
	bNotifyTick = true;
	BlackboardKey.AddVectorFilter(this, GET_MEMBER_NAME_CHECKED(UBTTask_ShineDriveTo, BlackboardKey));
	BlackboardKey.AddObjectFilter(this, GET_MEMBER_NAME_CHECKED(UBTTask_ShineDriveTo, BlackboardKey), AActor::StaticClass());
}

bool UBTTask_ShineDriveTo::ReadGoal(const UBehaviorTreeComponent& OwnerComp, FVector& OutGoal) const
{
	const UBlackboardComponent* BB = OwnerComp.GetBlackboardComponent();
	if (!BB)
	{
		return false;
	}
	if (BlackboardKey.SelectedKeyType == UBlackboardKeyType_Object::StaticClass())
	{
		const AActor* Target = Cast<AActor>(BB->GetValueAsObject(BlackboardKey.SelectedKeyName));
		if (!Target)
		{
			return false;
		}
		OutGoal = Target->GetActorLocation();
		return true;
	}
	OutGoal = BB->GetValueAsVector(BlackboardKey.SelectedKeyName);
	return FAISystem::IsValidLocation(OutGoal);
}

EBTNodeResult::Type UBTTask_ShineDriveTo::ExecuteTask(UBehaviorTreeComponent& OwnerComp, uint8* NodeMemory)
{
	FVector Goal;
	const bool bIsCop = Cast<AProhibitionCopController>(OwnerComp.GetAIOwner()) != nullptr;
	return bIsCop && ReadGoal(OwnerComp, Goal) ? EBTNodeResult::InProgress : EBTNodeResult::Failed;
}

void UBTTask_ShineDriveTo::TickTask(UBehaviorTreeComponent& OwnerComp, uint8* NodeMemory, float DeltaSeconds)
{
	AProhibitionCopController* AI = Cast<AProhibitionCopController>(OwnerComp.GetAIOwner());
	FVector Goal;
	if (!AI || !AI->GetPawn() || !ReadGoal(OwnerComp, Goal))
	{
		FinishLatentTask(OwnerComp, EBTNodeResult::Failed);
		return;
	}
	if (!bFollowContinuously && FVector::Dist2D(AI->GetPawn()->GetActorLocation(), Goal) < AcceptanceRadius)
	{
		AI->StopDriving();
		FinishLatentTask(OwnerComp, EBTNodeResult::Succeeded);
		return;
	}
	AI->DriveToward(Goal, AI->GetDesiredSpeed() * SpeedScale, DeltaSeconds);
}

EBTNodeResult::Type UBTTask_ShineDriveTo::AbortTask(UBehaviorTreeComponent& OwnerComp, uint8* NodeMemory)
{
	if (AProhibitionCopController* AI = Cast<AProhibitionCopController>(OwnerComp.GetAIOwner()))
	{
		AI->StopDriving();
	}
	return EBTNodeResult::Aborted;
}
