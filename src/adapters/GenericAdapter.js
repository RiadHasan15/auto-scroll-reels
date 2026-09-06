/**
 * Generic Web Page Fallback Adapter
 */
class GenericAdapter extends BaseAdapter {
  constructor() {
    super();
    this.id = 'generic';
    this.name = 'Web Page';
  }

  static matches(url) {
    return true; // Matches everything as fallback
  }

  isCommentsOpen() {
    return false;
  }

  scrollToNext() {
    window.scrollBy({ top: window.innerHeight * 0.75, behavior: 'smooth' });
  }

  scrollToPrevious() {
    window.scrollBy({ top: -window.innerHeight * 0.75, behavior: 'smooth' });
  }
}
