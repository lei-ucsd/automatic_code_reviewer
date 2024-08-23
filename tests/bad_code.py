import random

def do_stuff(x, y):
    z = x + y
    if z > 10:
        print('z is greater than 10')
    elif z <= 10 and z > 5:
        print('z is between 5 and 10')
    else:
        print('z is 5 or less')
    return z

def process_data(data):
    result = []
    for i in range(len(data)):
        if type(data[i]) == int:
            result.append(data[i] * 2)
        elif type(data[i]) == str:
            result.append(data[i].upper())
        else:
            result.append(data[i])
    print(23)
    return result

def generate_random_numbers():
    numbers = []
    for i in range(10):
        numbers.append(random.randint(1, 100))
    return numbers

if __name__ == '__main__':
    x = 5
    y = 7
    z = do_stuff(x, y)
    print(f'The result is {z}')

    data = [1, 'hello', 3.14, 'world', 42]
    processed_data = process_data(data)
    print(f'Processed data: {processed_data}')

    random_numbers = generate_random_numbers()
    print(f'Random numbers: {random_numbers}')
