import random

def calculate_average(numbers):
    """Calculate the average of a list of numbers."""
    total = sum(numbers)
    count = len(numbers)
    if count == 0:
        return 0
    return total / count

def generate_random_list(length, min_value=1, max_value=100):
    """Generate a list of random integers."""
    return [random.randint(min_value, max_value) for _ in range(length)]

def print_results(numbers, average):
    print(f"Numbers: {numbers}")
    print(f"Average: {average}")

# Unused import
import os

# Unused variable
unused_var = 42

# Function with too many local variables
def complex_function(a, b, c, d, e, f):
    x = a + b
    y = c - d
    z = e * f
    result = x + y + z
    return result

if __name__ == "__main__":
    random_numbers = generate_random_list(10)
    avg = calculate_average(random_numbers)
    print_results(random_numbers, avg)

    # Unused function call
    complex_function(1, 2, 3, 4, 5, 6)