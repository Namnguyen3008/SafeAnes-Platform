FROM public.ecr.aws/lambda/python:3.12

# Copy requirements and install
COPY aws/lambda_inference/requirements.txt ${LAMBDA_TASK_ROOT}/requirements.txt
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

# Copy ML application code and models
COPY backend/app/ml ${LAMBDA_TASK_ROOT}/backend/app/ml
COPY models ${LAMBDA_TASK_ROOT}/models
COPY aws/lambda_inference/app.py ${LAMBDA_TASK_ROOT}/app.py

# Create __init__.py files so Python packages resolve cleanly
RUN touch ${LAMBDA_TASK_ROOT}/backend/__init__.py && \
    touch ${LAMBDA_TASK_ROOT}/backend/app/__init__.py

ENV PYTHONPATH="${LAMBDA_TASK_ROOT}"

# Set the CMD to your handler
CMD [ "app.lambda_handler" ]
