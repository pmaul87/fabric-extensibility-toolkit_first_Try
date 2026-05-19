# Diagnostic script to check if semantic model tables have data
# Run this in Fabric notebook to verify extraction results

from pyspark.sql import SparkSession

spark = SparkSession.builder.getOrCreate()

tables = [
    "lineage_semantic_models",
    "lineage_semantic_model_tables", 
    "lineage_semantic_model_columns",
    "lineage_semantic_model_measures",
    "lineage_semantic_model_relationships",
    "lineage_semantic_model_dependencies"
]

print("=" * 80)
print("SEMANTIC MODEL TABLES - DATA CHECK")
print("=" * 80)

for table in tables:
    try:
        df = spark.read.table(table)
        count = df.count()
        print(f"\n📊 {table}")
        print(f"   Row count: {count}")
        
        if count > 0:
            print(f"   Sample columns: {', '.join(df.columns[:5])}")
            print(f"   First row preview:")
            df.show(1, truncate=50, vertical=True)
        else:
            print(f"   ⚠️  TABLE IS EMPTY")
            
    except Exception as e:
        print(f"\n❌ {table}")
        print(f"   Error: {str(e)}")

print("\n" + "=" * 80)
print("If all tables show 0 rows, run the extraction notebook:")
print("  Workload/notebooks/extraction/01_extract_semantic_models.ipynb")
print("=" * 80)
