#include "ProhibitionCop.h"
#include "ProhibitionCopController.h"

AProhibitionCop::AProhibitionCop()
{
	// Cops get their own AI brain, and no camera or player input.
	AIControllerClass = AProhibitionCopController::StaticClass();
	AutoPossessAI = EAutoPossessAI::PlacedInWorldOrSpawned;
}
