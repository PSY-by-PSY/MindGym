"""HTTP adapter for the billing vertical slice."""

from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from backend.billing.errors import ProviderNotConfigured, RepositoryError
from backend.billing.service import BillingService, CreateCheckoutCommand


router = APIRouter(prefix="/v1/billing", tags=["billing"])


class PlanResponse(BaseModel):
    code: str
    display_name: str
    amount_cents: int
    currency: str
    terms_version: str


class CreateCheckoutRequest(BaseModel):
    plan_code: str = Field(min_length=1, max_length=100)
    terms_version: str = Field(min_length=1, max_length=100)
    recurring_consent: bool
    recurring_consent_version: str = Field(min_length=1, max_length=100)


class CheckoutResponse(BaseModel):
    order_id: str
    status: str
    expires_at: str
    redirect_url: str | None = None
    form_action: str | None = None
    form_fields: dict[str, str] | None = None

class OrderStatusResponse(BaseModel):
    id: str
    status: str
    paid_at: str | None
    expires_at: str
    can_resume: bool


class OrderHistoryResponse(BaseModel):
    id: str
    status: str
    kind: str
    amount_cents: int
    currency: str
    created_at: str
    paid_at: str | None
    expires_at: str


class BillingOverviewResponse(BaseModel):
    # This is a billing read model, not the canonical entitlement until P3 cutover.
    subscription_id: str | None = None
    plan_code: str | None = None
    subscription_status: str | None = None
    current_period_ends_at: str | None = None
    next_charge_at: str | None = None
    cancel_at: str | None = None
    orders: list[OrderHistoryResponse]


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")
    return token


def _service(request: Request) -> BillingService:
    service = getattr(request.app.state, "billing_service", None)
    if service is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Billing is unavailable")
    return service


@router.get("/plans", response_model=list[PlanResponse])
async def list_plans(request: Request):
    try:
        return await _service(request).list_plans()
    except RepositoryError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Billing plans are unavailable") from None


@router.post("/checkout-sessions", response_model=CheckoutResponse, status_code=status.HTTP_201_CREATED)
async def create_checkout_session(
    body: CreateCheckoutRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    idempotency_key: str | None = Header(default=None),
):
    if not idempotency_key or len(idempotency_key) > 255:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Idempotency-Key is required")
    if not body.recurring_consent:
        raise HTTPException(status_code=422, detail="Recurring consent is required")
    repository = getattr(request.app.state, "billing_repository", None)
    if repository is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Billing is unavailable")
    try:
        user_id = await repository.authenticated_user_id(_bearer_token(authorization))
        created = await _service(request).create_checkout(
            CreateCheckoutCommand(
                user_id=user_id,
                plan_code=body.plan_code,
                terms_version=body.terms_version,
                recurring_consent_version=body.recurring_consent_version,
                idempotency_key=idempotency_key,
            )
        )
    except ProviderNotConfigured:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Checkout is not enabled") from None
    except RepositoryError as exc:
        code = status.HTTP_401_UNAUTHORIZED if str(exc) == "invalid authentication token" else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail="Checkout could not be created") from None
    return CheckoutResponse(
        order_id=created.checkout.order_id,
        status=created.checkout.status,
        expires_at=created.checkout.expires_at.isoformat(),
        redirect_url=created.provider_session.redirect_url,
        form_action=created.provider_session.form_action,
        form_fields=created.provider_session.form_fields,
    )

@router.get("/orders/{order_id}", response_model=OrderStatusResponse)
async def get_order(order_id: str, request: Request, authorization: str | None = Header(default=None)):
    repository = getattr(request.app.state, "billing_repository", None)
    if repository is None: raise HTTPException(status_code=503, detail="Billing is unavailable")
    try:
        user_id = await repository.authenticated_user_id(_bearer_token(authorization))
        order = await _service(request).get_order(user_id, order_id)
    except RepositoryError as exc:
        if str(exc) == "invalid authentication token": raise HTTPException(status_code=401, detail="Invalid token") from None
        raise HTTPException(status_code=503, detail="Order status unavailable") from None
    if order is None: raise HTTPException(status_code=404, detail="Order not found")
    return OrderStatusResponse(id=order.id,status=order.status,paid_at=order.paid_at.isoformat() if order.paid_at else None,expires_at=order.expires_at.isoformat(),can_resume=order.can_resume)


@router.get("/me", response_model=BillingOverviewResponse)
async def get_billing_overview(request: Request, authorization: str | None = Header(default=None)):
    repository = getattr(request.app.state, "billing_repository", None)
    if repository is None:
        raise HTTPException(status_code=503, detail="Billing is unavailable")
    try:
        user_id = await repository.authenticated_user_id(_bearer_token(authorization))
        overview = await _service(request).get_overview(user_id)
    except RepositoryError as exc:
        if str(exc) == "invalid authentication token":
            raise HTTPException(status_code=401, detail="Invalid token") from None
        raise HTTPException(status_code=503, detail="Billing overview unavailable") from None
    if overview is None:
        return BillingOverviewResponse(orders=[])
    return BillingOverviewResponse(
        subscription_id=overview.subscription_id, plan_code=overview.plan_code,
        subscription_status=overview.subscription_status,
        current_period_ends_at=overview.current_period_ends_at.isoformat() if overview.current_period_ends_at else None,
        next_charge_at=overview.next_charge_at.isoformat() if overview.next_charge_at else None,
        cancel_at=overview.cancel_at.isoformat() if overview.cancel_at else None,
        orders=[OrderHistoryResponse(
            id=order.id, status=order.status, kind=order.kind,
            amount_cents=order.amount_cents, currency=order.currency,
            created_at=order.created_at.isoformat(),
            paid_at=order.paid_at.isoformat() if order.paid_at else None,
            expires_at=order.expires_at.isoformat(),
        ) for order in overview.orders],
    )


@router.post("/orders/{order_id}/resume", response_model=CheckoutResponse)
async def resume_checkout_session(
    order_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    repository = getattr(request.app.state, "billing_repository", None)
    if repository is None:
        raise HTTPException(status_code=503, detail="Billing is unavailable")
    try:
        user_id = await repository.authenticated_user_id(_bearer_token(authorization))
        resumed = await _service(request).resume_checkout(user_id, order_id)
    except ProviderNotConfigured:
        raise HTTPException(status_code=503, detail="Checkout is not enabled") from None
    except RepositoryError as exc:
        if str(exc) == "invalid authentication token":
            raise HTTPException(status_code=401, detail="Invalid token") from None
        raise HTTPException(status_code=503, detail="Checkout unavailable") from None
    if resumed is None:
        raise HTTPException(status_code=404, detail="Order is not resumable")
    return CheckoutResponse(
        order_id=resumed.checkout.order_id,
        status=resumed.checkout.status,
        expires_at=resumed.checkout.expires_at.isoformat(),
        redirect_url=resumed.provider_session.redirect_url,
        form_action=resumed.provider_session.form_action,
        form_fields=resumed.provider_session.form_fields,
    )


@router.post("/payuni/callback")
async def payuni_callback(request: Request):
    fields = {key: value for key, value in (await request.form()).items() if isinstance(value, str)}
    try:
        await _service(request).record_callback(fields)
    except (ProviderNotConfigured, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payment callback") from None
    except RepositoryError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Callback persistence unavailable") from None
    return {"status": "accepted"}
