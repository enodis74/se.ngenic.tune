'use strict';

module.exports = class CircularList {
    constructor() {
        this.items = [];
        this.currentIndex = 0;
    }

    add(item) {
        this.items.push(item);
        console.log('Update callback added');
    }

    remove(item) {
        const index = this.items.indexOf(item);

        if (index !== -1) {
            this.items.splice(index, 1);

            if (index < this.currentIndex) {
                /* If the removed item is before the current index, the current index
                 * must be decremented to keep the current index pointing to the same item.
                 */
                this.currentIndex--;
            }

            if (this.currentIndex >= this.items.length) {
                this.currentIndex = 0;
            }
            console.log('Update callback removed');
        } else {
            console.log('Error: Update callback not found');
        }
    }

    next() {
        if (this.items.length === 0) {
            return null;
        }
        const item = this.items[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.items.length;
        return item;
    }

    toArray() {
        return [...this.items];
    }
};

